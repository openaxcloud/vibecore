import type { ProviderName, ProviderConfig, StatusCheckResult } from './types';
import { OpenAIStatusChecker } from './providers/openai';
import { BaseProviderChecker } from './base-provider';

// Import other provider implementations as they are created

export class ProviderStatusCheckerFactory {
  private static _providerConfigs: Record<ProviderName, ProviderConfig> = {
    OpenAI: {
      statusUrl: 'https://status.openai.com/',
      apiUrl: 'https://api.openai.com/v1/models',
      headers: {
        Authorization: 'Bearer $OPENAI_API_KEY',
      },
      testModel: 'gpt-3.5-turbo',
    },
    Anthropic: {
      statusUrl: 'https://status.anthropic.com/',
      apiUrl: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': '$ANTHROPIC_API_KEY',
        'anthropic-version': '2024-02-29',
      },
      testModel: 'claude-3-sonnet-20240229',
    },
    AmazonBedrock: {
      statusUrl: 'https://health.aws.amazon.com/health/status',
      apiUrl: 'https://bedrock.us-east-1.amazonaws.com/models',
      headers: {
        Authorization: 'Bearer $AWS_BEDROCK_CONFIG',
      },
      testModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
    },
    Cohere: {
      statusUrl: 'https://status.cohere.com/',
      apiUrl: 'https://api.cohere.ai/v1/models',
      headers: {
        Authorization: 'Bearer $COHERE_API_KEY',
      },
      testModel: 'command',
    },
    Deepseek: {
      statusUrl: 'https://status.deepseek.com/',
      apiUrl: 'https://api.deepseek.com/v1/models',
      headers: {
        Authorization: 'Bearer $DEEPSEEK_API_KEY',
      },
      testModel: 'deepseek-chat',
    },
    Google: {
      statusUrl: 'https://status.cloud.google.com/',
      apiUrl: 'https://generativelanguage.googleapis.com/v1/models',
      headers: {
        'x-goog-api-key': '$GOOGLE_API_KEY',
      },
      testModel: 'gemini-pro',
    },
    Groq: {
      statusUrl: 'https://groqstatus.com/',
      apiUrl: 'https://api.groq.com/v1/models',
      headers: {
        Authorization: 'Bearer $GROQ_API_KEY',
      },
      testModel: 'mixtral-8x7b-32768',
    },
    HuggingFace: {
      statusUrl: 'https://status.huggingface.co/',
      apiUrl: 'https://api-inference.huggingface.co/models',
      headers: {
        Authorization: 'Bearer $HUGGINGFACE_API_KEY',
      },
      testModel: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
    },
    Hyperbolic: {
      statusUrl: 'https://status.hyperbolic.ai/',
      apiUrl: 'https://api.hyperbolic.ai/v1/models',
      headers: {
        Authorization: 'Bearer $HYPERBOLIC_API_KEY',
      },
      testModel: 'hyperbolic-1',
    },
    Mistral: {
      statusUrl: 'https://status.mistral.ai/',
      apiUrl: 'https://api.mistral.ai/v1/models',
      headers: {
        Authorization: 'Bearer $MISTRAL_API_KEY',
      },
      testModel: 'mistral-tiny',
    },
    OpenRouter: {
      statusUrl: 'https://status.openrouter.ai/',
      apiUrl: 'https://openrouter.ai/api/v1/models',
      headers: {
        Authorization: 'Bearer $OPEN_ROUTER_API_KEY',
      },
      testModel: 'anthropic/claude-3-sonnet',
    },
    Perplexity: {
      statusUrl: 'https://status.perplexity.com/',
      apiUrl: 'https://api.perplexity.ai/v1/models',
      headers: {
        Authorization: 'Bearer $PERPLEXITY_API_KEY',
      },
      testModel: 'pplx-7b-chat',
    },
    Together: {
      statusUrl: 'https://status.together.ai/',
      apiUrl: 'https://api.together.xyz/v1/models',
      headers: {
        Authorization: 'Bearer $TOGETHER_API_KEY',
      },
      testModel: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
    },
    XAI: {
      statusUrl: 'https://status.x.ai/',
      apiUrl: 'https://api.x.ai/v1/models',
      headers: {
        Authorization: 'Bearer $XAI_API_KEY',
      },
      testModel: 'grok-1',
    },
  };

  static getChecker(provider: ProviderName): BaseProviderChecker {
    const config = this._providerConfigs[provider];

    if (!config) {
      throw new Error(`No configuration found for provider: ${provider}`);
    }

    // Return specific provider implementation or fallback to base implementation
    switch (provider) {
      case 'OpenAI':
        return new OpenAIStatusChecker(config);

      // Add other provider implementations as they are created
      default:
        return new (class extends BaseProviderChecker {
          async checkStatus(): Promise<StatusCheckResult> {
            const endpointStatus = await this.checkEndpoint(this.config.statusUrl);
            const apiStatus = await this.checkEndpoint(this.config.apiUrl);

            return {
              status: endpointStatus === 'reachable' && apiStatus === 'reachable' ? 'operational' : 'degraded',
              message: `Status page: ${endpointStatus}, API: ${apiStatus}`,
              incidents: ['Note: Limited status information due to CORS restrictions'],
            };
          }
        })(config);
    }
  }

  static getProviderNames(): ProviderName[] {
    return Object.keys(this._providerConfigs) as ProviderName[];
  }

  static getProviderConfig(provider: ProviderName): ProviderConfig | undefined {
    return this._providerConfigs[provider];
  }
}
