import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const slug = params.slug;

  if (!slug) {
    return json({ error: 'Missing slug', code: 'MCP_CATALOG_SLUG_REQUIRED' }, { status: 400 });
  }

  const payload = await apiRequest(request, `/mcp/catalog/${encodeURIComponent(slug)}`);

  return json(payload);
}
