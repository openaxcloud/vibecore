import { createHmac, randomBytes } from 'node:crypto';
import type { LLMProvider } from './provider-credentials';
import type { IProviderSetting } from '~/types/model';

/** Private to this process; never serialized into client annotations or logs. */
export type ProviderHealthScope = Readonly<{ provider: string; id: string }>;

const processSalt = randomBytes(32);

export function createProviderHealthScope(options: {
  provider: LLMProvider;
  apiKeys?: Record<string, string>;
  serverEnv?: Record<string, string>;
  providerSettings?: Record<string, IProviderSetting>;
}): ProviderHealthScope {
  const { provider, apiKeys, serverEnv, providerSettings } = options;

  // Use the provider's own resolver, including its SSRF and managed-key exfiltration guards.
  const { apiKey, baseUrl } = provider.getProviderBaseUrlAndKey({
    apiKeys,
    serverEnv,
    providerSettings: providerSettings?.[provider.name],
    defaultApiTokenKey: provider.config.apiTokenKey ?? '',
    defaultBaseUrlKey: provider.config.baseUrlKey ?? '',
  });
  const id = createHmac('sha256', processSalt)
    .update(JSON.stringify([provider.name, apiKeys?.[provider.name] ? 'byok' : 'managed', apiKey ?? '', baseUrl ?? '']))
    .digest('hex');

  return { provider: provider.name, id };
}
