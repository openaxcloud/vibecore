import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import {
  getModelApiCopy,
  localizeModelInfo,
  localizeProviderInfo,
  resolveModelApiLanguage,
} from '~/lib/i18n/catalogs/model-api';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
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
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.models');

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

interface ModelsErrorResponse {
  code: 'MODEL_CATALOG_UNAVAILABLE' | 'MODEL_PROVIDER_NOT_FOUND';
  error: string;
}

export function toPublicModelSummaries(modelList: ModelInfo[], language?: string | null): PublicModelSummary[] {
  const copy = getModelApiCopy(language);

  return modelList.map((model) => ({
    id: model.name,
    name: model.label || model.name,
    provider: model.provider || copy['modelApi.unknownProvider'],
    description: model.label || model.name,
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
  const localeResolution = resolveRequestLocale(request);
  const language = resolveModelApiLanguage(localeResolution.language);
  const copy = getModelApiCopy(language);
  const headers = localeResponseHeaders(request, { ...localeResolution, language });

  headers.set('Cache-Control', 'private, no-store');

  try {
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

      if (!provider) {
        return json<ModelsErrorResponse>(
          { code: 'MODEL_PROVIDER_NOT_FOUND', error: copy['modelApi.providerNotFound'] },
          { status: 404, headers },
        );
      }

      modelList = await llmManager.getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: context.cloudflare?.env,
      });
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

    const localizedModelList = modelList.map((model) => localizeModelInfo(model, language));

    return json<ModelsResponse>(
      {
        modelList: localizedModelList,
        models: toPublicModelSummaries(localizedModelList, language),
        providers: providers.map((provider) => localizeProviderInfo(provider, language)),
        defaultProvider: localizeProviderInfo(defaultProvider, language),
      },
      { headers },
    );
  } catch (error) {
    logger.error('MODEL_CATALOG_UNAVAILABLE', {
      kind: error instanceof Error ? error.name : typeof error,
    });

    return json<ModelsErrorResponse>(
      { code: 'MODEL_CATALOG_UNAVAILABLE', error: copy['modelApi.catalogUnavailable'] },
      { status: 503, headers },
    );
  }
}
