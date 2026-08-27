import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const slug = params.slug;

  if (!slug) {
    return remainingApiErrorResponse(request, 'MCP_CATALOG_SLUG_REQUIRED', 400);
  }

  const payload = await apiRequest(request, `/mcp/catalog/${encodeURIComponent(slug)}`);

  return json(payload);
}
