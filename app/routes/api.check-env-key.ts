import type { LoaderFunction } from 'react-router';
import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { readSessionToken } from '~/lib/enterprise-api.server';
import { LLMManager } from '~/lib/modules/llm/manager';

export const loader: LoaderFunction = async ({ context, request }) => {
  /*
   * Require a session: unauthenticated, this route is an infra-config oracle that
   * leaks which platform provider secrets are set (via the env fallback below).
   * Gated like the sibling /api/configured-providers.
   */
  if (!readSessionToken(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const provider = url.searchParams.get('provider');

  if (!provider) {
    return Response.json({ isSet: false });
  }

  const llmManager = LLMManager.getInstance(context?.cloudflare?.env as any);
  const providerInstance = llmManager.getProvider(provider);

  if (!providerInstance || !providerInstance.config.apiTokenKey) {
    return Response.json({ isSet: false });
  }

  const envVarName = providerInstance.config.apiTokenKey;

  // Get API keys from cookie
  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);

  /*
   * Check API key in order of precedence:
   * 1. Client-side API keys (from cookies)
   * 2. Server environment variables (from Cloudflare env)
   * 3. Process environment variables (from .env.local)
   * 4. LLMManager environment variables
   */
  const rawValue =
    apiKeys?.[provider] ||
    (context?.cloudflare?.env as Record<string, any>)?.[envVarName] ||
    process.env[envVarName] ||
    llmManager.env[envVarName];

  const normalizedValue = typeof rawValue === 'string' ? rawValue.replace(/\s+/g, '') : rawValue;
  const isSet = !!(normalizedValue && String(normalizedValue).length > 0);

  return Response.json({ isSet });
};
