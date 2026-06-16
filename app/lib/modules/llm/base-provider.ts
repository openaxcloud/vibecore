import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';
import { LLMManager } from './manager';
import { isBlockedProviderBaseUrl } from './provider-url-guard';
import { readRuntimeEnv } from './runtime-env';
import type { ProviderInfo, ProviderConfig, ModelInfo } from './types';
import type { IProviderSetting } from '~/types/model';

/** Default timeout for model listing API calls (5 seconds) */
const MODEL_FETCH_TIMEOUT = 5_000;

export abstract class BaseProvider implements ProviderInfo {
  abstract name: string;
  abstract staticModels: ModelInfo[];
  abstract config: ProviderConfig;
  cachedDynamicModels?: {
    cacheId: string;
    models: ModelInfo[];
  };

  getApiKeyLink?: string;
  labelForGetApiKey?: string;
  icon?: string;

  /**
   * Convert Cloudflare Env bindings to a plain Record<string, string>.
   * Useful because provider methods expect Record<string, string> but
   * Cloudflare Workers pass an Env interface.
   */
  protected convertEnvToRecord(env?: Env): Record<string, string> {
    if (!env) {
      return {};
    }

    return Object.entries(env).reduce(
      (acc, [key, value]) => {
        /*
         * Skip unset bindings so they don't become the literal strings
         * "undefined"/"null", which would later pass the API-key string guard.
         */
        if (value !== undefined && value !== null) {
          acc[key] = String(value);
        }

        return acc;
      },
      {} as Record<string, string>,
    );
  }

  /**
   * Rewrite localhost / 127.0.0.1 URLs to host.docker.internal when
   * running inside Docker. Only applies on the server side.
   */
  protected resolveDockerUrl(baseUrl: string, serverEnv?: Record<string, string>): string {
    /*
     * Vite shims bare `process.env` to {} during SSR, so reading it here would
     * silently never detect Docker. Use readRuntimeEnv (globalThis.process.env).
     */
    const isDocker = readRuntimeEnv('RUNNING_IN_DOCKER') === 'true' || serverEnv?.RUNNING_IN_DOCKER === 'true';

    if (!isDocker) {
      return baseUrl;
    }

    return baseUrl.replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal');
  }

  /**
   * Create an AbortSignal that times out after the given milliseconds.
   * Used to prevent model-listing fetches from hanging indefinitely.
   */
  protected createTimeoutSignal(ms: number = MODEL_FETCH_TIMEOUT): AbortSignal {
    return AbortSignal.timeout(ms);
  }

  getProviderBaseUrlAndKey(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: IProviderSetting;
    serverEnv?: Record<string, string>;
    defaultBaseUrlKey: string;
    defaultApiTokenKey: string;
  }) {
    const { apiKeys, providerSettings, serverEnv, defaultBaseUrlKey, defaultApiTokenKey } = options;

    let settingsBaseUrl = providerSettings?.baseUrl;

    const manager = LLMManager.getInstance();

    if (settingsBaseUrl !== undefined && settingsBaseUrl.trim().length === 0) {
      settingsBaseUrl = undefined;
    }

    const baseUrlKey = this.config.baseUrlKey || defaultBaseUrlKey;

    /*
     * SSRF guard: settingsBaseUrl is USER-supplied (providerSettings cookie) and
     * is fetched server-side. Drop it if it targets metadata/internal hosts so a
     * tenant can't redirect server requests into the cluster — falling back to the
     * trusted server/default base URL. Loopback stays allowed (Ollama/LM Studio);
     * private hosts can be allowed for self-host via ALLOW_PRIVATE_PROVIDER_BASE_URLS.
     */
    const allowPrivateBaseUrls =
      (readRuntimeEnv('ALLOW_PRIVATE_PROVIDER_BASE_URLS') ?? manager.env?.ALLOW_PRIVATE_PROVIDER_BASE_URLS) === 'true';
    const safeSettingsBaseUrl =
      settingsBaseUrl && !isBlockedProviderBaseUrl(settingsBaseUrl, allowPrivateBaseUrls) ? settingsBaseUrl : undefined;

    const baseUrlIsUserSupplied = Boolean(safeSettingsBaseUrl);

    let baseUrl =
      safeSettingsBaseUrl ||
      serverEnv?.[baseUrlKey] ||
      readRuntimeEnv(baseUrlKey) ||
      manager.env?.[baseUrlKey] ||
      this.config.baseUrl;

    if (baseUrl && baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }

    const apiTokenKey = this.config.apiTokenKey || defaultApiTokenKey;

    /*
     * Never forward a MANAGED (server-env) key to a user-supplied base URL — that
     * would exfiltrate the platform's provider credential to a tenant-controlled
     * endpoint. Only the user's OWN key (apiKeys) may accompany their own baseUrl.
     */
    const managedApiKey = baseUrlIsUserSupplied
      ? undefined
      : serverEnv?.[apiTokenKey] || readRuntimeEnv(apiTokenKey) || manager.env?.[apiTokenKey];

    const apiKeyValue = apiKeys?.[this.name] || managedApiKey;

    const apiKey = typeof apiKeyValue === 'string' ? apiKeyValue.replace(/\s+/g, '') : apiKeyValue;

    return {
      baseUrl,
      apiKey,
    };
  }
  getModelsFromCache(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
  }): ModelInfo[] | null {
    if (!this.cachedDynamicModels) {
      return null;
    }

    const cacheKey = this.cachedDynamicModels.cacheId;
    const generatedCacheKey = this.getDynamicModelsCacheKey(options);

    if (cacheKey !== generatedCacheKey) {
      this.cachedDynamicModels = undefined;

      return null;
    }

    return this.cachedDynamicModels.models;
  }
  getDynamicModelsCacheKey(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
  }) {
    // Only include provider-relevant env keys, not the entire server environment
    const relevantEnvKeys = [this.config.baseUrlKey, this.config.apiTokenKey].filter(Boolean) as string[];
    const relevantEnv: Record<string, string> = {};

    for (const key of relevantEnvKeys) {
      if (options.serverEnv?.[key]) {
        relevantEnv[key] = options.serverEnv[key];
      }
    }

    return JSON.stringify({
      apiKeys: options.apiKeys?.[this.name],
      providerSettings: options.providerSettings?.[this.name],
      serverEnv: relevantEnv,
    });
  }
  storeDynamicModels(
    options: {
      apiKeys?: Record<string, string>;
      providerSettings?: Record<string, IProviderSetting>;
      serverEnv?: Record<string, string>;
    },
    models: ModelInfo[],
  ) {
    const cacheId = this.getDynamicModelsCacheKey(options);

    this.cachedDynamicModels = {
      cacheId,
      models,
    };
  }

  // Declare the optional getDynamicModels method
  getDynamicModels?(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]>;

  abstract getModelInstance(options: {
    model: string;
    serverEnv?: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1;
}

type OptionalApiKey = string | undefined;

export function getOpenAILikeModel(baseURL: string, apiKey: OptionalApiKey, model: string) {
  const openai = createOpenAI({
    baseURL,
    apiKey,
  });

  return openai(model);
}
