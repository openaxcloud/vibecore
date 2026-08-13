import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { json } from '~/lib/json-response';
import {
  getPlatformKeyedProviderNames,
  isManagedModelsMode,
  trimToUsableProviders,
} from '~/lib/modules/llm/managed-models';
import { LLMManager } from '~/lib/modules/llm/manager';
import { fetchAdminEnabledProviders } from '~/lib/modules/llm/provider-visibility.server';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';

/**
 * Shape consumed by the public marketing landing's AI model selector widget
 * (the prebuilt `ecode-static` SPA). It reads `models[].{id,name,provider,...}`
 * and renders a "No AI providers configured" warning when the array is empty.
 * The IDE/app consumers read `modelList`/`providers`/`defaultProvider` instead,
 * so this field is purely additive and backward-compatible.
 */
interface PublicModelSummary {
  id: string;
  name: string;
  provider: string;
  description: string;
  supportsStreaming: boolean;
}

interface ModelsResponse {
  modelList: ModelInfo[];
  models: PublicModelSummary[];
  providers: ProviderInfo[];
  defaultProvider: ProviderInfo;
}

function toPublicModelSummaries(modelList: ModelInfo[]): PublicModelSummary[] {
  return modelList.map((model) => ({
    id: model.name,
    name: model.label ?? model.name,
    provider: model.provider ?? 'Unknown',
    description: model.label ?? model.name,
    supportsStreaming: true,
  }));
}

let cachedProviders: ProviderInfo[] | null = null;
let cachedDefaultProvider: ProviderInfo | null = null;

function getProviderInfo(llmManager: LLMManager) {
  if (!cachedProviders) {
    cachedProviders = llmManager.getAllProviders().map((provider) => ({
      name: provider.name,
      staticModels: provider.staticModels,
      getApiKeyLink: provider.getApiKeyLink,
      labelForGetApiKey: provider.labelForGetApiKey,
      icon: provider.icon,
    }));
  }

  if (!cachedDefaultProvider) {
    const defaultProvider = llmManager.getDefaultProvider();
    cachedDefaultProvider = {
      name: defaultProvider.name,
      staticModels: defaultProvider.staticModels,
      getApiKeyLink: defaultProvider.getApiKeyLink,
      labelForGetApiKey: defaultProvider.labelForGetApiKey,
      icon: defaultProvider.icon,
    };
  }

  return { providers: cachedProviders, defaultProvider: cachedDefaultProvider };
}

export async function loader({
  request,
  params,
  context,
}: {
  request: Request;
  params: { provider?: string };
  context: {
    cloudflare?: {
      env: Record<string, string>;
    };
  };
}): Promise<Response> {
  const llmManager = LLMManager.getInstance(context.cloudflare?.env);

  // Get client side maintained API keys and provider settings from cookies
  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);
  const providerSettings = getProviderSettingsFromCookie(cookieHeader);

  let { providers, defaultProvider } = getProviderInfo(llmManager);

  let modelList: ModelInfo[] = [];

  if (params.provider) {
    // Only update models for the specific provider
    const provider = llmManager.getProvider(params.provider);

    if (provider) {
      modelList = await llmManager.getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: context.cloudflare?.env,
      });
    }
  } else {
    // Update all models
    modelList = await llmManager.updateModelList({
      apiKeys,
      providerSettings,
      serverEnv: context.cloudflare?.env,
    });
  }

  /*
   * Managed (Replit-parity) mode: the model selector must list ONLY usable
   * models = providers with a configured platform key. Hide providers without a
   * platform key (e.g. Groq/Mistral/OpenRouter when those secrets aren't set) so
   * a user — who has no BYOK key entry anymore — can't pick a dead provider.
   * Off by default (full legacy/BYOK list) so dev / self-host is unchanged.
   */
  if (isManagedModelsMode(context.cloudflare?.env)) {
    const usableProviderNames = getPlatformKeyedProviderNames(llmManager.getAllProviders(), context.cloudflare?.env);
    ({ modelList, providers, defaultProvider } = trimToUsableProviders({
      modelList,
      providers,
      defaultProvider,
      usableProviderNames,
    }));
  }

  /*
   * Apply the admin provider visibility toggle on top of the key-based trim: a
   * provider an admin disabled is hidden from the selector even if it has a key.
   * Fail-open (null) leaves the list untouched, so a broken table never hides all.
   */
  const adminEnabled = await fetchAdminEnabledProviders(request);

  if (adminEnabled) {
    ({ modelList, providers, defaultProvider } = trimToUsableProviders({
      modelList,
      providers,
      defaultProvider,
      usableProviderNames: adminEnabled,
    }));
  }

  return json<ModelsResponse>({
    modelList,
    models: toPublicModelSummaries(modelList),
    providers,
    defaultProvider,
  });
}
