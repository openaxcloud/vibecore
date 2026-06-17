import { readRuntimeEnv } from './runtime-env';
import type { ModelInfo } from './types';
import type { ProviderInfo } from '~/types/model';

/**
 * Managed (Replit-parity) model mode. When on, the platform admin owns the
 * provider keys and end users pick ONLY from models that are actually usable —
 * i.e. backed by a platform key. The model selector must therefore hide every
 * provider without a configured platform key (Groq/Mistral/OpenRouter/… when
 * those secrets aren't set) so a user can't select a "dead" provider that has
 * no key and no BYOK entry to add one.
 *
 * Detection mirrors `VITE_BYOK_DISABLED` (the build-time flag that hides the
 * per-user key UI), but read at RUNTIME on the web pod. The SSR bundle's
 * `process.env` is shimmed to `{}` by vite-plugin-node-polyfills, so we read
 * `globalThis.process.env` via `readRuntimeEnv` (same gotcha as provider keys).
 * The Helm configmap sets `VITE_BYOK_DISABLED: "true"` as a real pod env so the
 * loader sees it; a bare local build leaves it unset → full BYOK list (no trim).
 */
export function isManagedModelsMode(serverEnv?: Record<string, string | undefined>): boolean {
  const value = serverEnv?.VITE_BYOK_DISABLED ?? readRuntimeEnv('VITE_BYOK_DISABLED');
  return value === 'true';
}

interface ProviderLike {
  name: string;
  config?: { apiTokenKey?: string };
}

/**
 * Provider name → extra env var names that ALSO count as that provider's
 * platform key. The web LLM provider's `apiTokenKey` doesn't always match the
 * env name the platform injects: prod sets the Google key as
 * `GOOGLE_GEMINI_API_KEY` (the name the ai-gateway uses,
 * services/ai-gateway/src/gateway.ts) while the web provider's `apiTokenKey` is
 * `GOOGLE_GENERATIVE_AI_API_KEY`. Without this alias a genuinely-paid Google
 * provider would be wrongly trimmed out of the managed selector.
 */
const PROVIDER_KEY_ALIASES: Record<string, string[]> = {
  Google: ['GOOGLE_GEMINI_API_KEY'],
};

function envHasValue(key: string, serverEnv?: Record<string, string | undefined>): boolean {
  const value = serverEnv?.[key] ?? readRuntimeEnv(key);
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Names of providers that have a non-empty platform API key in the pod env
 * (under the provider's `apiTokenKey` or a known alias). A provider with no
 * `apiTokenKey` (local providers like Ollama/LMStudio) is never "platform-keyed"
 * and is excluded from managed cloud mode.
 */
export function getPlatformKeyedProviderNames(
  allProviders: ProviderLike[],
  serverEnv?: Record<string, string | undefined>,
): Set<string> {
  const usable = new Set<string>();

  for (const provider of allProviders) {
    const candidateKeys = [provider.config?.apiTokenKey, ...(PROVIDER_KEY_ALIASES[provider.name] ?? [])].filter(
      (key): key is string => typeof key === 'string' && key.length > 0,
    );

    if (candidateKeys.some((key) => envHasValue(key, serverEnv))) {
      usable.add(provider.name);
    }
  }

  return usable;
}

export interface TrimInput {
  modelList: ModelInfo[];
  providers: ProviderInfo[];
  defaultProvider: ProviderInfo;
  usableProviderNames: Set<string>;
}

export interface TrimOutput {
  modelList: ModelInfo[];
  providers: ProviderInfo[];
  defaultProvider: ProviderInfo;
}

/**
 * Trim a legacy `/api/models` payload down to the platform-keyed providers.
 * Pure so it is unit-testable without a live LLM manager. If the trim would
 * remove every provider (misconfiguration — no platform keys at all) it keeps
 * the original lists so the IDE never ends up with an empty, unusable selector.
 */
export function trimToUsableProviders({
  modelList,
  providers,
  defaultProvider,
  usableProviderNames,
}: TrimInput): TrimOutput {
  const trimmedProviders = providers.filter((provider) => usableProviderNames.has(provider.name));

  if (trimmedProviders.length === 0) {
    // No platform keys resolved — don't strand the user with an empty selector.
    return { modelList, providers, defaultProvider };
  }

  const trimmedModels = modelList.filter((model) => !!model.provider && usableProviderNames.has(model.provider));

  const trimmedDefault = usableProviderNames.has(defaultProvider.name) ? defaultProvider : trimmedProviders[0];

  return { modelList: trimmedModels, providers: trimmedProviders, defaultProvider: trimmedDefault };
}
