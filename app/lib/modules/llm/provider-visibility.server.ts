import { apiRequest } from '~/lib/enterprise-api.server';

/*
 * Admin-managed set of provider DISPLAY NAMES enabled for the user model selector
 * (source of truth = ProviderConfig.enabled, exposed by the API's GET
 * /providers/enabled). The selector shows a provider only if it is admin-enabled
 * AND has a usable key.
 *
 * Returns null on ANY failure or an empty/garbage result so every caller fails
 * OPEN — a broken or empty visibility table must NEVER hide every provider and
 * strand the user with no models.
 */
export async function fetchAdminEnabledProviders(request: Request): Promise<Set<string> | null> {
  try {
    const data = await apiRequest<{ providers?: unknown }>(request, '/providers/enabled');

    if (!data || !Array.isArray(data.providers) || data.providers.length === 0) {
      return null;
    }

    const names = data.providers.filter((name): name is string => typeof name === 'string' && name.length > 0);

    return names.length > 0 ? new Set(names) : null;
  } catch {
    return null;
  }
}
