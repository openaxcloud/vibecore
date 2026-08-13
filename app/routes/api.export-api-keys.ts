import { data as json, type LoaderFunction } from 'react-router';
import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { readSessionToken } from '~/lib/enterprise-api.server';
import { LLMManager } from '~/lib/modules/llm/manager';

export const loader: LoaderFunction = async ({ context, request }) => {
  /*
   * Require an authenticated session — this returns credential material and has
   * no business answering anonymous callers, even though it only ever echoes the
   * caller's own cookie-scoped keys (server secrets are already excluded below).
   */
  if (!readSessionToken(request)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get API keys from cookie
  const cookieHeader = request.headers.get('Cookie');
  const apiKeysFromCookie = getApiKeysFromCookie(cookieHeader);

  // Initialize the LLM manager to access environment variables
  const llmManager = LLMManager.getInstance(context?.cloudflare?.env as any);

  // Get all provider instances to find their API token keys
  const providers = llmManager.getAllProviders();

  // Create a comprehensive API keys object
  const apiKeys: Record<string, string> = { ...apiKeysFromCookie };

  // For each provider, check all possible sources for API keys
  for (const provider of providers) {
    if (!provider.config.apiTokenKey) {
      continue;
    }

    const envVarName = provider.config.apiTokenKey;

    // Skip if we already have this provider's key from cookies
    if (apiKeys[provider.name]) {
      continue;
    }

    /*
     * SECURITY: never fold the platform's server-side provider secrets into the
     * export. This endpoint is unauthenticated and shared across tenants, so
     * returning `process.env`/Cloudflare-env keys would leak the deployment's
     * own LLM credentials to any anonymous caller. Only the caller's own
     * cookie-scoped keys (already copied above) may be exported.
     */
    void envVarName;
  }

  /*
   * These are credentials — forbid any intermediary or browser caching so the
   * secrets never land in a shared cache, the browser disk cache, or history.
   */
  return Response.json(apiKeys, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
    },
  });
};
