import type { LoaderFunction } from 'react-router';
import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { readSessionToken } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';
import { LLMManager } from '~/lib/modules/llm/manager';
import { readRuntimeEnv } from '~/lib/modules/llm/runtime-env';

export const loader: LoaderFunction = async ({ context, request }) => {
  /*
   * Require a session: unauthenticated, this route is an infra-config oracle that
   * leaks which platform provider secrets are set (via the env fallback below).
   * Gated like the sibling /api/configured-providers.
   */
  if (!readSessionToken(request)) {
    return remainingApiErrorResponse(request, 'UNAUTHORIZED', 401);
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
   * 3. Process environment variables (from .env.local), read via
   *    `readRuntimeEnv` — same SSR trap as api.configured-providers:
   *    `process.env` is shimmed to `{}` by vite-plugin-node-polyfills in the
   *    SSR bundle, so a bare read reports the key as absent even when it is
   *    set and working (BUG-QA-PROVIDERS-SSR-ENV-001). Go through
   *    `globalThis.process.env`.
   * 4. LLMManager environment variables
   */
  const rawValue =
    apiKeys?.[provider] ||
    (context?.cloudflare?.env as Record<string, any>)?.[envVarName] ||
    readRuntimeEnv(envVarName) ||
    llmManager.env[envVarName];

  const normalizedValue = typeof rawValue === 'string' ? rawValue.replace(/\s+/g, '') : rawValue;
  const isSet = !!(normalizedValue && String(normalizedValue).length > 0);

  return Response.json({ isSet });
};
