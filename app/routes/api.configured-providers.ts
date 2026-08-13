import type { LoaderFunction } from 'react-router';
import { data as json } from 'react-router';
import { readSessionToken } from '~/lib/enterprise-api.server';
import { LLMManager } from '~/lib/modules/llm/manager';

interface ConfiguredProvider {
  name: string;
  isConfigured: boolean;
  configMethod: 'environment' | 'none';
}

interface ConfiguredProvidersResponse {
  providers: ConfiguredProvider[];
}

/**
 * API endpoint that detects which providers are configured via environment variables
 * This helps auto-enable providers that have been set up by the user
 */
export const loader: LoaderFunction = async ({ context, request }) => {
  /*
   * Require an authenticated session. This endpoint reports which platform LLM
   * provider secrets are present in the server environment; exposing that to
   * anonymous callers is an infra-config oracle. Only signed-in users (the only
   * ones who reach the Connections settings that consume this) may read it.
   */
  if (!readSessionToken(request)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const llmManager = LLMManager.getInstance((context?.cloudflare?.env ?? {}) as any);
    const configuredProviders: ConfiguredProvider[] = [];

    // Check every registered provider so cloud provider status matches the UI.
    for (const provider of llmManager.getAllProviders()) {
      const providerName = provider.name;
      const providerInstance = llmManager.getProvider(providerName);

      let isConfigured = false;
      let configMethod: 'environment' | 'none' = 'none';

      if (providerInstance) {
        const config = providerInstance.config;

        /*
         * Check if required environment variables are set
         * For providers with baseUrlKey (Ollama, LMStudio, OpenAILike)
         */
        if (config.baseUrlKey) {
          const baseUrlEnvVar = config.baseUrlKey;
          const cloudflareEnv = (context?.cloudflare?.env as Record<string, any>)?.[baseUrlEnvVar];
          const processEnv = process.env[baseUrlEnvVar];
          const managerEnv = llmManager.env[baseUrlEnvVar];

          const envBaseUrl = cloudflareEnv || processEnv || managerEnv;

          /*
           * Only consider configured if environment variable is explicitly set
           * Don't count default config.baseUrl values or placeholder values
           */
          const isValidEnvValue =
            envBaseUrl &&
            typeof envBaseUrl === 'string' &&
            envBaseUrl.replace(/\s+/g, '').length > 0 &&
            !envBaseUrl.includes('your_') && // Filter out placeholder values like "your_openai_like_base_url_here"
            !envBaseUrl.includes('_here') &&
            envBaseUrl.startsWith('http'); // Must be a valid URL

          if (isValidEnvValue) {
            isConfigured = true;
            configMethod = 'environment';
          }
        }

        // For providers that might need API keys as well (check this separately, not as fallback)
        if (config.apiTokenKey && !isConfigured) {
          const apiTokenEnvVar = config.apiTokenKey;

          const envApiToken =
            (context?.cloudflare?.env as Record<string, any>)?.[apiTokenEnvVar] ||
            process.env[apiTokenEnvVar] ||
            llmManager.env[apiTokenEnvVar];

          // Only consider configured if API key is set and not a placeholder
          const isValidApiToken =
            envApiToken &&
            typeof envApiToken === 'string' &&
            envApiToken.replace(/\s+/g, '').length > 0 &&
            !envApiToken.includes('your_') && // Filter out placeholder values
            !envApiToken.includes('_here') &&
            envApiToken.length > 10; // API keys are typically longer than 10 chars

          if (isValidApiToken) {
            isConfigured = true;
            configMethod = 'environment';
          }
        }
      }

      configuredProviders.push({
        name: providerName,
        isConfigured,
        configMethod,
      });
    }

    return json<ConfiguredProvidersResponse>({
      providers: configuredProviders,
    });
  } catch (error) {
    console.error('Error detecting configured providers:', error);

    // Return default state on error
    return json<ConfiguredProvidersResponse>({
      providers: [],
    });
  }
};
